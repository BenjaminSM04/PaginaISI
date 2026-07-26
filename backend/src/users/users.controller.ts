import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { DirectoryQueryDto, DirectorySearchDto, UpdateProfileDto } from './users.dto';
import { AllowUnverified, CurrentUser, Public, AuthUser } from '../common/decorators';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me/activity')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mi actividad: proyectos, artículos, preguntas y transacciones de puntos' })
  myActivity(@CurrentUser() user: AuthUser) {
    return this.users.myActivity(user.id);
  }

  @Patch('me/profile')
  @AllowUnverified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualiza mi perfil y habilidades' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Public()
  @Get('directory/teachers')
  @ApiOperation({ summary: 'Docentes disponibles como revisores, con paginación opcional' })
  async teachers(@Query() query: DirectoryQueryDto) {
    const paginated = query.q !== undefined || query.page !== undefined || query.limit !== undefined;
    // Sin parámetros se conserva el array histórico para los clientes
    // desplegados, pero limitado a una primera ventana segura.
    const result = await this.users.teachers(paginated ? query : { page: 1, limit: 50 });
    return paginated ? result : result.items;
  }

  @Get('directory/search')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Búsqueda privada y paginada de usuarios para selectores' })
  searchDirectory(@Query() query: DirectorySearchDto) {
    return this.users.searchDirectory(query);
  }

  @Public()
  @Get(':username')
  @ApiOperation({ summary: 'Perfil público por username' })
  publicProfile(@Param('username') username: string) {
    return this.users.publicProfile(username);
  }
}
